import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ELEVATED_PAD, MAIN_HELIPAD, RADIO_TOWER, groundHeightAt } from './physics';
import type { GatePoint, MissionDefinition, MissionProgress } from './types';

export interface GateVisual {
  group: THREE.Group;
  ringMat: THREE.MeshStandardMaterial;
  beaconMat: THREE.MeshBasicMaterial;
}

export interface WorldHandles {
  turbineRotors: THREE.Group[];
  windsockCone: THREE.Mesh;
  towerBeaconMat: THREE.MeshStandardMaterial;
  hoverZoneMesh: THREE.Mesh;
  landingBeaconMesh: THREE.Mesh;
  gateGroup: THREE.Group;
  gateVisuals: GateVisual[];
  losAnchor: THREE.Vector3;
  sunLight: THREE.DirectionalLight;
  updateMissionVisuals: (mission: MissionDefinition, progress: MissionProgress, elapsed: number) => void;
  dispose: () => void;
}

function createHelipadTexture(label: string, accentColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Concrete base
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concrete grain
  for (let i = 0; i < 2400; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 512;
    const y = (Math.sin(i * 78.233) * 19341.231 % 1 + 1) % 1 * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, 3, 3);
  }

  // Outer safety ring
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(256, 256, 212, 0, Math.PI * 2);
  ctx.stroke();

  // Inner dashed ring
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 6;
  ctx.setLineDash([24, 18]);
  ctx.beginPath();
  ctx.arc(256, 256, 168, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center H
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(178, 152, 32, 208);
  ctx.fillRect(302, 152, 32, 208);
  ctx.fillRect(178, 240, 156, 32);

  // Label at bottom
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 256, 444);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTerrainDetailTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 4500; i++) {
    const x = (i * 73) % 256;
    const y = (i * 139 + Math.floor(i / 256) * 29) % 256;
    const shade = 110 + ((i * 37) % 40);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  return tex;
}

export function buildTrainingWorld(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): WorldHandles {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 1. Studio Environment Reflection (RoomEnvironment) + Atmospheric Sky
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmremGenerator.dispose();

  const sky = new Sky();
  sky.scale.setScalar(4500);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 4.2;
  skyUniforms['rayleigh'].value = 1.6;
  skyUniforms['mieCoefficient'].value = 0.004;
  skyUniforms['mieDirectionalG'].value = 0.82;

  const sunVec = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - 34); // 34 deg sun elevation
  const theta = THREE.MathUtils.degToRad(142);
  sunVec.setFromSphericalCoords(1, phi, theta);
  skyUniforms['sunPosition'].value.copy(sunVec);

  scene.fog = new THREE.FogExp2(0xc7d9e8, 0.0036);

  // 2. Warm/Cool 3-Point Outdoor Lighting Rig
  const hemiLight = new THREE.HemisphereLight(0x9ed0ff, 0x3b4d34, 0.95);
  hemiLight.position.set(0, 60, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.5);
  sunLight.position.copy(sunVec).multiplyScalar(110);
  sunLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = 85;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 250;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
  }
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0xbfe0ff, 0.55);
  rimLight.position.set(-70, 35, 80);
  scene.add(rimLight);

  // 3. Open-World Procedural Terrain
  const terrainSize = 360;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, 112, 112);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cGrass = new THREE.Color(0x466d3b);
  const cAirfield = new THREE.Color(0x4d7740);
  const cSand = new THREE.Color(0x9a8f6f);
  const cRock = new THREE.Color(0x5e6770);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    const r = Math.hypot(x, z);
    if (y < -0.6) {
      tmpColor.copy(cSand);
    } else if (y > 9.5) {
      const rockMix = Math.min(1, (y - 9.5) / 10);
      tmpColor.copy(cGrass).lerp(cRock, rockMix);
    } else if (r < 34) {
      tmpColor.copy(cAirfield);
    } else {
      const n = 0.5 + 0.5 * Math.sin(x * 0.08 + z * 0.06);
      tmpColor.copy(cAirfield).lerp(cGrass, n * 0.85);
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainBump = createTerrainDetailTexture();
  terrainBump.anisotropy = maxAniso;
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.02,
    bumpMap: terrainBump,
    bumpScale: 0.25,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 4. Coastal Lake Water Plane (NE basin)
  const lakeGeo = new THREE.CircleGeometry(36, 48);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a6985,
    roughness: 0.14,
    metalness: 0.12,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
  });
  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.position.set(66, -1.6, -10);
  lakeMesh.receiveShadow = true;
  scene.add(lakeMesh);

  // 5. Main Takeoff Helipad H & Runway Strip
  const mainPadTex = createHelipadTexture('DECOLAGEM', '#f59e0b');
  mainPadTex.anisotropy = maxAniso;
  const padMat = new THREE.MeshStandardMaterial({
    map: mainPadTex,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.05,
  });
  const padGeo = new THREE.CylinderGeometry(MAIN_HELIPAD.radius, MAIN_HELIPAD.radius + 0.35, MAIN_HELIPAD.topY, 32);
  const mainPad = new THREE.Mesh(padGeo, [
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 }),
    padMat,
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }),
  ]);
  mainPad.position.set(MAIN_HELIPAD.x, MAIN_HELIPAD.topY * 0.5, MAIN_HELIPAD.z);
  mainPad.receiveShadow = true;
  scene.add(mainPad);

  // Runway approach strip heading north (-Z)
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x2a3441, roughness: 0.82 });
  const stripMesh = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.06, 28), stripMat);
  stripMesh.position.set(0, 0.03, -17);
  stripMesh.receiveShadow = true;
  scene.add(stripMesh);

  // Runway centerline dashes (offset >= 0.02 on Y to prevent Z-fighting)
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 2.2), dashMat);
    dash.position.set(0, 0.065, -7 - i * 4.2);
    scene.add(dash);
  }

  // 6. Windsock Pole beside Main Helipad
  const windsockGroup = new THREE.Group();
  windsockGroup.position.set(7.5, groundHeightAt(7.5, -2), -2);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.75 });
  const wsPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 12), poleMat);
  wsPole.position.y = 2.3;
  wsPole.castShadow = true;
  windsockGroup.add(wsPole);

  const coneGeo = new THREE.ConeGeometry(0.32, 1.45, 12, 1, true);
  coneGeo.rotateZ(-Math.PI / 2);
  coneGeo.translate(0.75, 0, 0);
  const windsockCone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.65, side: THREE.DoubleSide })
  );
  windsockCone.position.set(0, 4.35, 0);
  windsockGroup.add(windsockCone);
  scene.add(windsockGroup);

  // 7. Elevated Precision Landing Platform (NE)
  const elevGroup = new THREE.Group();
  const elevGroundY = groundHeightAt(ELEVATED_PAD.x, ELEVATED_PAD.z);
  elevGroup.position.set(ELEVATED_PAD.x, 0, ELEVATED_PAD.z);

  const elevPadTex = createHelipadTexture('ALVO B', '#38bdf8');
  elevPadTex.anisotropy = maxAniso;
  const elevTop = new THREE.Mesh(
    new THREE.CylinderGeometry(ELEVATED_PAD.radius, ELEVATED_PAD.radius + 0.2, 0.45, 32),
    [
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: elevPadTex, color: 0xffffff, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }),
    ]
  );
  elevTop.position.y = ELEVATED_PAD.topY - 0.225;
  elevTop.receiveShadow = true;
  elevTop.castShadow = true;
  elevGroup.add(elevTop);

  // 4 Concrete Support Columns grounded below terrain
  const colHeight = ELEVATED_PAD.topY - elevGroundY + 1.5;
  const colMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
  for (const [cx, cz] of [
    [-2.2, -2.2],
    [2.2, -2.2],
    [-2.2, 2.2],
    [2.2, 2.2],
  ]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, colHeight, 12), colMat);
    col.position.set(cx, ELEVATED_PAD.topY - 0.4 - colHeight * 0.5, cz);
    col.castShadow = true;
    elevGroup.add(col);
  }
  scene.add(elevGroup);

  // 8. Radio Tower Landmark (28m tall, visible from spawn!)
  const towerGroup = new THREE.Group();
  const towerBaseY = groundHeightAt(RADIO_TOWER.x, RADIO_TOWER.z);
  towerGroup.position.set(RADIO_TOWER.x, towerBaseY, RADIO_TOWER.z);

  const towerBase = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 1.2, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88 })
  );
  towerBase.position.y = 0.6;
  towerBase.receiveShadow = true;
  towerGroup.add(towerBase);

  const redSteel = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.42, metalness: 0.55 });
  const whiteSteel = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.38, metalness: 0.55 });

  // 4 tapered legs + 6 horizontal tier rings
  const legGeo = new THREE.CylinderGeometry(0.11, 0.18, RADIO_TOWER.height, 8);
  for (const [lx, lz] of [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [1.1, 1.1],
  ]) {
    const leg = new THREE.Mesh(legGeo, redSteel);
    leg.position.set(lx * 0.72, RADIO_TOWER.height * 0.5 + 0.8, lz * 0.72);
    leg.rotation.z = lx * 0.032;
    leg.rotation.x = -lz * 0.032;
    leg.castShadow = true;
    towerGroup.add(leg);
  }

  for (let tier = 0; tier < 6; tier++) {
    const y = 3.5 + tier * 4.2;
    const w = 2.4 - tier * 0.25;
    const ring = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.22, w),
      tier % 2 === 0 ? whiteSteel : redSteel
    );
    ring.position.y = y;
    towerGroup.add(ring);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 4.5, 10), whiteSteel);
  mast.position.y = RADIO_TOWER.height + 2.2;
  towerGroup.add(mast);

  const towerBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xff3b30,
    emissive: 0xff3b30,
    emissiveIntensity: 3.0,
    roughness: 0.2,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), towerBeaconMat);
  beacon.position.y = RADIO_TOWER.height + 4.5;
  towerGroup.add(beacon);
  scene.add(towerGroup);

  // 9. Two Composite Wind Turbines on the Eastern Ridge
  const turbineRotors: THREE.Group[] = [];
  const turbineCoords: Array<[number, number]> = [
    [84, -46],
    [88, 22],
  ];
  const turbineMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.2 });
  const nacelleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.28, metalness: 0.35 });

  for (const [tx, tz] of turbineCoords) {
    const tGroup = new THREE.Group();
    const ty = groundHeightAt(tx, tz);
    tGroup.position.set(tx, ty, tz);
    tGroup.rotation.y = -Math.PI * 0.35;

    const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.85, 22, 14), turbineMat);
    mastMesh.position.y = 11;
    mastMesh.castShadow = true;
    tGroup.add(mastMesh);

    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 3.2), nacelleMat);
    nacelle.position.set(0, 22.2, 0.4);
    tGroup.add(nacelle);

    const rotor = new THREE.Group();
    rotor.position.set(0, 22.2, 2.1);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 14), turbineMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.4;
    rotor.add(nose);

    const bladeGeo = new THREE.BoxGeometry(0.45, 9.5, 0.14);
    bladeGeo.translate(0, 4.9, 0);
    for (let b = 0; b < 3; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.z = (b * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(bladeGeo, turbineMat);
      blade.rotation.y = 0.15;
      bladeWrap.add(blade);
      rotor.add(bladeWrap);
    }

    tGroup.add(rotor);
    turbineRotors.push(rotor);
    scene.add(tGroup);
  }

  // 10. Pilot Observation Stand & Training Hangar (Solo LOS Camera Anchor)
  const standPos = { x: -16, z: 16 };
  const standBaseY = groundHeightAt(standPos.x, standPos.z);
  const hangarGroup = new THREE.Group();
  hangarGroup.position.set(standPos.x, standBaseY, standPos.z);
  hangarGroup.rotation.y = 0.65;

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.6, 5.2),
    new THREE.MeshStandardMaterial({ color: 0x78553a, roughness: 0.82 })
  );
  deck.position.y = 0.3;
  deck.receiveShadow = true;
  hangarGroup.add(deck);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.8, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.25 })
  );
  cabin.position.set(-0.6, 2.0, 0);
  cabin.castShadow = true;
  hangarGroup.add(cabin);

  const cabinGlass = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.1, 2.6),
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.25,
      clearcoat: 1.0,
    })
  );
  cabinGlass.position.set(-0.6, 2.35, 0);
  hangarGroup.add(cabinGlass);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.25, 4.6),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.3 })
  );
  roof.position.set(-0.4, 3.5, 0);
  roof.castShadow = true;
  hangarGroup.add(roof);
  scene.add(hangarGroup);

  const losAnchor = new THREE.Vector3(standPos.x + 2.2, standBaseY + 2.1, standPos.z - 2.2);

  // 11. Instanced Pine Trees & Natural Perimeter Boulders
  const treePositions: Array<{ x: number; z: number; scale: number }> = [];
  for (let i = 0; i < 160; i++) {
    const angle = i * 2.39996; // Golden angle distribution
    const radius = 36 + ((i * 19.7) % 102);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;

    // Keep airfield center, lake, elevated pad, and tower clear
    const lakeD = Math.hypot(tx - 66, tz + 10);
    const padD = Math.hypot(tx - ELEVATED_PAD.x, tz - ELEVATED_PAD.z);
    const towerD = Math.hypot(tx - RADIO_TOWER.x, tz - RADIO_TOWER.z);
    const ty = groundHeightAt(tx, tz);
    if (lakeD < 29 || padD < 11 || towerD < 10 || ty < -0.3) continue;

    const scale = 0.85 + ((i * 7) % 30) / 100; // ±15% natural scale variation
    treePositions.push({ x: tx, z: tz, scale });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 7);
  trunkGeo.translate(0, 1.3, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
  trunkInst.castShadow = true;

  const foliageGeo = new THREE.ConeGeometry(1.9, 5.4, 8);
  foliageGeo.translate(0, 4.8, 0);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, treePositions.length);
  foliageInst.castShadow = true;
  foliageInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const treeColor = new THREE.Color();
  treePositions.forEach((tp, idx) => {
    const gy = groundHeightAt(tp.x, tp.z);
    dummy.position.set(tp.x, gy - 0.1, tp.z);
    dummy.rotation.set(0, (idx * 1.7) % (Math.PI * 2), 0);
    dummy.scale.setScalar(tp.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);
    foliageInst.setMatrixAt(idx, dummy.matrix);

    // Subtle organic green tint variation
    treeColor.setHSL(0.32 + ((idx % 5) - 2) * 0.014, 0.42, 0.24 + (idx % 4) * 0.03);
    foliageInst.setColorAt(idx, treeColor);
  });
  trunkInst.computeBoundingSphere();
  foliageInst.computeBoundingSphere();
  scene.add(trunkInst);
  scene.add(foliageInst);

  // Instanced Boulders around foothills & lake shore
  const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.05 });
  const rockCount = 64;
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockInst.receiveShadow = true;
  for (let i = 0; i < rockCount; i++) {
    const a = i * 1.93;
    const r = 42 + ((i * 23) % 95);
    const rx = Math.cos(a) * r;
    const rz = Math.sin(a) * r;
    const ry = groundHeightAt(rx, rz);
    dummy.position.set(rx, ry + 0.3, rz);
    dummy.rotation.set(i * 0.5, i * 1.1, i * 0.3);
    const s = 0.7 + ((i * 11) % 12) * 0.12;
    dummy.scale.set(s * 1.2, s * 0.75, s);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    treeColor.setHSL(0.6, 0.06, 0.36 + (i % 4) * 0.05);
    rockInst.setColorAt(i, treeColor);
  }
  rockInst.computeBoundingSphere();
  scene.add(rockInst);

  // 12. Dynamic Mission Elements (Gates, Hover Column, Precision Landing Beacon)
  const hoverZoneMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 4.5, 6.0, 28, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  hoverZoneMesh.position.set(0, 7.5, 0);
  hoverZoneMesh.visible = false;
  scene.add(hoverZoneMesh);

  const landingBeaconMesh = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 32),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  landingBeaconMesh.rotation.x = -Math.PI / 2;
  landingBeaconMesh.position.set(ELEVATED_PAD.x, ELEVATED_PAD.topY + 0.04, ELEVATED_PAD.z);
  landingBeaconMesh.visible = false;
  scene.add(landingBeaconMesh);

  const gateGroup = new THREE.Group();
  scene.add(gateGroup);
  let gateVisuals: GateVisual[] = [];
  let currentBuiltMissionId = '';

  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
  const pylonAccentMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35, metalness: 0.2 });

  function rebuildGates(gates: GatePoint[]) {
    while (gateGroup.children.length > 0) {
      gateGroup.remove(gateGroup.children[0]);
    }
    gateVisuals = [];

    for (const g of gates) {
      const grp = new THREE.Group();
      grp.position.set(g.x, g.y, g.z);
      grp.rotation.y = g.yaw;

      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.3,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(g.radius * 0.85, 0.22, 12, 32), ringMat);
      grp.add(ring);

      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(g.radius * 0.82, 24), beaconMat);
      grp.add(innerDisc);

      // Left & right support pylons down to terrain
      const gy = groundHeightAt(g.x, g.z);
      const legHeight = Math.max(1, g.y - gy);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, legHeight, 8), pylonMat);
        post.position.set(side * (g.radius * 0.88), -legHeight * 0.5, 0);
        grp.add(post);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), pylonAccentMat);
        cap.position.set(side * (g.radius * 0.88), 0, 0);
        grp.add(cap);
      }

      gateGroup.add(grp);
      gateVisuals.push({ group: grp, ringMat, beaconMat });
    }
  }

  function updateMissionVisuals(mission: MissionDefinition, progress: MissionProgress, elapsed: number) {
    if (currentBuiltMissionId !== mission.id) {
      currentBuiltMissionId = mission.id;
      rebuildGates(mission.gates);
    }

    hoverZoneMesh.visible = Boolean(mission.hoverTarget) && !progress.completed;
    if (hoverZoneMesh.visible) {
      const pulse = 0.2 + Math.sin(elapsed * 4) * 0.07;
      (hoverZoneMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
      (hoverZoneMesh.material as THREE.MeshBasicMaterial).color.setHex(
        progress.hoverTimerSec > 0.1 ? 0x10b981 : 0x38bdf8
      );
    }

    landingBeaconMesh.visible = Boolean(mission.targetLandingPad) && !progress.completed;
    if (landingBeaconMesh.visible) {
      const s = 1 + Math.sin(elapsed * 4) * 0.08;
      landingBeaconMesh.scale.set(s, s, 1);
    }

    gateVisuals.forEach((gv, idx) => {
      const isFreeFlight = mission.id === 'free_flight';
      const cleared = isFreeFlight
        ? (progress.ringsCollected & (1 << idx)) !== 0
        : idx < progress.activeGateIndex;
      const isTarget = !isFreeFlight && idx === progress.activeGateIndex;

      if (cleared) {
        gv.ringMat.color.setHex(0x10b981);
        gv.ringMat.emissive.setHex(0x059669);
        gv.ringMat.emissiveIntensity = 0.6;
        gv.beaconMat.color.setHex(0x10b981);
        gv.beaconMat.opacity = 0.04;
      } else if (isTarget || isFreeFlight) {
        gv.ringMat.color.setHex(0xf59e0b);
        gv.ringMat.emissive.setHex(0xf59e0b);
        gv.ringMat.emissiveIntensity = 1.6 + Math.sin(elapsed * 5) * 0.5;
        gv.beaconMat.color.setHex(0xf59e0b);
        gv.beaconMat.opacity = 0.16;
      } else {
        gv.ringMat.color.setHex(0x38bdf8);
        gv.ringMat.emissive.setHex(0x0284c7);
        gv.ringMat.emissiveIntensity = 0.45;
        gv.beaconMat.color.setHex(0x38bdf8);
        gv.beaconMat.opacity = 0.06;
      }
    });
  }

  return {
    turbineRotors,
    windsockCone,
    towerBeaconMat,
    hoverZoneMesh,
    landingBeaconMesh,
    gateGroup,
    gateVisuals,
    losAnchor,
    sunLight,
    updateMissionVisuals,
    dispose: () => {
      envTex.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      terrainBump.dispose();
      mainPadTex.dispose();
      elevPadTex.dispose();
      trunkGeo.dispose();
      foliageGeo.dispose();
      rockGeo.dispose();
    },
  };
}
