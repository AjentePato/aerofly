/**
 * Efeitos visuais 3D pré-alocados para colisões do drone:
 * onda de choque aditiva, faíscas incandescentes, fragmentos de hélice/carbono e fumaça wispy em billboard.
 */
import * as THREE from 'three';
import { surfaceHeightAt } from './physics';
import { createSmokeSpriteTexture } from './proceduralTextures';
import type { Vec3 } from './types';

interface DebrisParticle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  life: number;
  maxLife: number;
  gravity: number;
  bounces: boolean;
  startScale: number;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseScale: number;
  rollAngle: number;
  rollRate: number;
}

export interface CrashEffectsController {
  trigger: (pos: Vec3, vel: Vec3, brokenProps: readonly boolean[]) => void;
  update: (dt: number, cameraQuaternion?: THREE.Quaternion) => void;
  reset: () => void;
  dispose: () => void;
}

const _rollQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

export function createCrashEffects(scene: THREE.Scene): CrashEffectsController {
  const group = new THREE.Group();
  scene.add(group);

  const smokeTex = createSmokeSpriteTexture();

  // 1. Expanding additive impact shockwave ring
  const ringGeo = new THREE.RingGeometry(0.28, 0.44, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shockRing = new THREE.Mesh(ringGeo, ringMat);
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.visible = false;
  group.add(shockRing);

  // 2. Incandescent additive sparks + carbon shards + detached propeller blades
  const sparkGeo = new THREE.BoxGeometry(0.045, 0.045, 0.18);
  const shardGeo = new THREE.BoxGeometry(0.09, 0.02, 0.07);
  const bladeGeo = new THREE.BoxGeometry(0.28, 0.008, 0.036);
  const smokeGeo = new THREE.PlaneGeometry(1.15, 1.15);

  const particles: DebrisParticle[] = [];
  const totalParticles = 26;

  for (let i = 0; i < totalParticles; i++) {
    const isBlade = i < 3;
    const isSpark = i >= 3 && i < 18;
    const geo = isBlade ? bladeGeo : isSpark ? sparkGeo : shardGeo;
    const color = isBlade ? 0x2a313d : isSpark ? (i % 2 === 0 ? 0xfde047 : 0xfb923c) : 0x161a21;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: isSpark ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !isSpark,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    particles.push({
      mesh,
      mat,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      life: 0,
      maxLife: 1,
      gravity: isSpark ? 14 : 16,
      bounces: !isSpark,
      startScale: 1,
    });
  }

  // 3. Soft procedural wispy smoke billboards (no spherical/icosahedral balls)
  const smokes: SmokePuff[] = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: smokeTex,
      color: i % 2 === 0 ? 0x8b95a5 : 0xb8c2cf,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(smokeGeo, mat);
    mesh.visible = false;
    group.add(mesh);
    smokes.push({
      mesh,
      mat,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      baseScale: 1,
      rollAngle: i * 0.7,
      rollRate: (i % 2 === 0 ? 1 : -1) * 0.65,
    });
  }

  let ringAge = -1;
  const ringMaxAge = 0.42;

  function trigger(pos: Vec3, vel: Vec3, brokenProps: readonly boolean[]) {
    const floorY = surfaceHeightAt(pos.x, pos.z, pos.y);
    shockRing.position.set(pos.x, Math.max(pos.y, floorY + 0.08), pos.z);
    shockRing.scale.setScalar(1);
    shockRing.visible = true;
    ringMat.opacity = 0.9;
    ringAge = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const isBlade = i < 3;
      const isSpark = i >= 3 && i < 18;
      if (isBlade && !brokenProps[i] && i > 0) {
        p.mesh.visible = false;
        p.life = p.maxLife;
        continue;
      }

      const angle = (i * 2.39996) % (Math.PI * 2);
      const radialSpeed = isSpark ? 3.4 + (i % 5) * 1.15 : isBlade ? 2.4 + i * 0.9 : 2.0 + (i % 4) * 0.8;
      p.mesh.position.set(
        pos.x + Math.cos(angle) * 0.12,
        Math.max(floorY + 0.12, pos.y),
        pos.z + Math.sin(angle) * 0.12
      );
      p.mesh.rotation.set(i * 0.5, angle, i * 0.3);
      p.vx = Math.cos(angle) * radialSpeed - vel.x * 0.18;
      p.vy = (isSpark ? 3.8 : 4.2) + (i % 4) * 0.95;
      p.vz = Math.sin(angle) * radialSpeed - vel.z * 0.18;
      p.rx = (i % 2 === 0 ? 1 : -1) * (8 + (i % 5) * 3);
      p.ry = (i % 3 === 0 ? 1 : -1) * (7 + (i % 4) * 2.5);
      p.rz = (i % 2 === 0 ? -1 : 1) * (9 + (i % 3) * 3);
      p.life = 0;
      p.maxLife = isSpark ? 0.52 + (i % 4) * 0.08 : 1.15 + (i % 3) * 0.12;
      p.startScale = isSpark ? 0.85 + (i % 3) * 0.25 : 1;
      p.mesh.scale.setScalar(p.startScale);
      p.mat.opacity = 1;
      p.mesh.visible = true;
    }

    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      const angle = (i * Math.PI * 2) / smokes.length + 0.35;
      s.mesh.position.set(
        pos.x + Math.cos(angle) * 0.28,
        Math.max(floorY + 0.22, pos.y + 0.1),
        pos.z + Math.sin(angle) * 0.28
      );
      s.vx = Math.cos(angle) * (1.2 + (i % 3) * 0.55);
      s.vy = 1.65 + (i % 4) * 0.45;
      s.vz = Math.sin(angle) * (1.2 + (i % 3) * 0.55);
      s.life = 0;
      s.maxLife = 1.05 + (i % 3) * 0.22;
      s.baseScale = 0.72 + (i % 3) * 0.24;
      s.mesh.scale.setScalar(s.baseScale);
      s.mat.opacity = 0.6;
      s.mesh.visible = true;
    }
  }

  function update(dt: number, cameraQuaternion?: THREE.Quaternion) {
    if (ringAge >= 0) {
      ringAge += dt;
      const t = Math.min(1, ringAge / ringMaxAge);
      shockRing.scale.setScalar(1 + t * 5.8);
      ringMat.opacity = (1 - t) * 0.85;
      if (t >= 1) {
        shockRing.visible = false;
        ringAge = -1;
      }
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.mesh.visible) continue;
      p.life += dt;
      const progress = p.life / p.maxLife;
      if (progress >= 1) {
        p.mesh.visible = false;
        continue;
      }

      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.ry * dt;
      p.mesh.rotation.z += p.rz * dt;

      const floorY = surfaceHeightAt(p.mesh.position.x, p.mesh.position.z, p.mesh.position.y);
      if (p.mesh.position.y < floorY + 0.04) {
        p.mesh.position.y = floorY + 0.04;
        if (p.bounces && p.vy < -0.8) {
          p.vy = -p.vy * 0.35;
          p.vx *= 0.65;
          p.vz *= 0.65;
        } else {
          p.vy = 0;
          p.vx *= Math.exp(-8 * dt);
          p.vz *= Math.exp(-8 * dt);
        }
      }

      const fade = progress > 0.55 ? 1 - (progress - 0.55) / 0.45 : 1;
      p.mat.opacity = Math.max(0, fade);
      if (i >= 3 && i < 18) {
        p.mesh.scale.setScalar(Math.max(0.15, p.startScale * (1 - progress * 0.72)));
      }
    }

    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (!s.mesh.visible) continue;
      s.life += dt;
      const progress = s.life / s.maxLife;
      if (progress >= 1) {
        s.mesh.visible = false;
        continue;
      }
      const drag = Math.exp(-2.1 * dt);
      s.vx *= drag;
      s.vz *= drag;
      s.vy *= Math.exp(-1.1 * dt);
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.rollAngle += s.rollRate * dt;

      if (cameraQuaternion) {
        _rollQuat.setFromAxisAngle(_zAxis, s.rollAngle);
        s.mesh.quaternion.copy(cameraQuaternion).multiply(_rollQuat);
      }

      s.mesh.scale.setScalar(s.baseScale * (1 + progress * 2.5));
      s.mat.opacity = Math.max(0, 0.65 * Math.pow(1 - progress, 1.3));
    }
  }

  function reset() {
    ringAge = -1;
    shockRing.visible = false;
    for (const p of particles) p.mesh.visible = false;
    for (const s of smokes) s.mesh.visible = false;
  }

  function dispose() {
    scene.remove(group);
    smokeTex.dispose();
    ringGeo.dispose();
    ringMat.dispose();
    sparkGeo.dispose();
    shardGeo.dispose();
    bladeGeo.dispose();
    smokeGeo.dispose();
    for (const p of particles) p.mat.dispose();
    for (const s of smokes) s.mat.dispose();
  }

  return { trigger, update, reset, dispose };
}
